# Week 2: Time-Based Compliance - Design Document

**Goal**: Add withdrawal timelocks (24-48hr delay for large amounts) with cancellation ability.

---

## Phase 1: Think (Before Any Code)

### State Transition Analysis

**Current State Machine:**
```
[Init] → Treasury exists, Vault exists
[Add User] → User can withdraw immediately
[Withdraw] → Instant transfer (no delay)
```

**Desired State Machine:**
```
[Init] → Treasury exists, Vault exists
[Add User] → User can propose or withdraw directly
[Propose Withdrawal] → PendingWithdrawal created (if > threshold)
  → Wait 24-48 hours
  → [Execute] → Transfer happens
  → OR [Cancel] → PendingWithdrawal closed
[Withdraw] → Instant transfer (if <= threshold)
```

**Key Questions:**
1. What state PERSISTS between propose and execute? → `PendingWithdrawal` account
2. Who can cancel? → Proposer? Admin? Both?
3. What if user's role changes during timelock? → Use role at proposal time or execution time?
4. What if vault becomes insufficient during timelock? → Fail at execute

---

## Phase 2: Authority Triad (For Each New Account)

### PendingWithdrawal Account

**Who PAYS?**
- Proposer pays rent (they want the withdrawal)
- Or: Treasury pays (withdrawal is treasury business)
- **Decision needed**: Discuss trade-offs

**Who SIGNS?**
- Proposer signs `propose_withdrawal`
- Proposer OR Admin signs `cancel_withdrawal`
- Proposer signs `execute_withdrawal`
- Vault PDA signs actual transfer (during execute)

**Who OWNS?**
- Program owns PendingWithdrawal
- No need for PDA (it's just data storage, doesn't sign anything)

---

## Phase 3: Account Lifecycle Design

### PendingWithdrawal Struct

**Lifecycle:**
1. **Birth**: Created in `propose_withdrawal`
2. **Life**: Waits for timelock to expire
3. **Death**: Closed in `execute_withdrawal` OR `cancel_withdrawal`

**Fields needed** (thinking through complete lifecycle):
```rust
pub struct PendingWithdrawal {
    pub treasury: Pubkey,        // Which treasury?
    pub proposer: Pubkey,         // Who requested this?
    pub recipient: Pubkey,        // Where does money go?
    pub amount: u64,              // How much?
    pub proposed_at: i64,         // When was it proposed? (Unix timestamp)
    pub timelock_duration: i64,   // How long to wait? (seconds)
    pub user_role_at_proposal: Role,  // Role when proposed (immutable)
    pub bump: u8,                 // Do we need this? NO - doesn't sign anything
}
```

**Wait, do we need a bump?**
→ Apply the principle: "Will this PDA need to sign?"
→ No, PendingWithdrawal is just data storage
→ We might use PDA for the address (deterministic), but don't need stored bump

**Actually, should it even be a PDA?**
→ PDA seeds would be: `[b"pending", treasury.key(), ???]`
→ What if user has multiple pending withdrawals?
→ Need unique identifier per withdrawal
→ Options:
  - A: Use counter (seed = `[b"pending", treasury, user, counter.to_le_bytes()]`)
  - B: Use timestamp (seed = `[b"pending", treasury, user, timestamp.to_le_bytes()]`)
  - C: Just use regular Keypair (not a PDA at all)

**SWOT Time:**

| Approach | Strengths | Weaknesses | Opportunities | Threats |
|----------|-----------|------------|---------------|---------|
| Counter-based PDA | Deterministic, can query all user's pending | Need to store counter in Treasury | Easy pagination | Counter overflow (unlikely) |
| Timestamp-based PDA | Unique by nature | Two proposals in same second collide | Time-based queries | Clock manipulation edge cases |
| Regular Keypair | Simple, no collisions | Can't derive address | Most flexible | Need to track addresses separately |

**Decision**: Counter-based PDA. Deterministic and queryable.

**Updated Treasury to include:**
```rust
pub struct Treasury {
    pub admin: Pubkey,
    pub bump: u8,
    pub vault_bump: u8,
    pub total_members: u32,
    pub pending_withdrawal_counter: u64,  // NEW
    pub withdrawal_threshold: u64,        // NEW - amount that triggers timelock
    pub timelock_duration: i64,           // NEW - how long to wait (e.g., 24 hours)
}
```

**Space calculation update:**
- Old: `8 + 32 + 1 + 1 + 4 = 46 bytes`
- New: `8 + 32 + 1 + 1 + 4 + 8 + 8 + 8 = 70 bytes`

---

## Phase 4: Invariants To Maintain

**System Invariants (must ALWAYS be true):**
1. No pending withdrawal can be executed before timelock expires
2. Executed/cancelled withdrawals no longer exist as accounts
3. Treasury pending counter only increases (never decreases)
4. All pending withdrawals reference valid treasury
5. Proposal timestamp must be ≤ current time (can't propose from future)

**Test implications:**
- Test executing before timelock (should fail)
- Test executing after timelock (should succeed)
- Test cancelling before timelock (should succeed)
- Test cancelling after execution (should fail - account doesn't exist)

---

## Phase 5: New Instructions Needed

### 1. `propose_withdrawal`
**Signature:**
```rust
pub fn propose_withdrawal(
    ctx: Context<ProposeWithdrawal>,
    amount: u64,
    recipient: Pubkey,
) -> Result<()>
```

**Authorization:**
- User must have UserAccount
- User must be authorized to withdraw
- Amount must exceed threshold (else use direct withdraw)

**State changes:**
- Create PendingWithdrawal account
- Increment treasury.pending_withdrawal_counter
- Emit ProposalCreated event

**Authority Triad:**
- Pays: Proposer (or treasury - decide based on game theory)
- Signs: Proposer
- Owns: Program

---

### 2. `execute_withdrawal`
**Signature:**
```rust
pub fn execute_withdrawal(
    ctx: Context<ExecuteWithdrawal>,
) -> Result<()>
```

**Authorization:**
- Proposer must sign
- Timelock must be expired: `current_time >= proposed_at + timelock_duration`
- Vault must have sufficient balance

**State changes:**
- Transfer SOL from vault to recipient
- Update UserAccount.total_withdrawn
- Close PendingWithdrawal account (reclaim rent)
- Emit WithdrawalExecuted event

**Authority Triad:**
- Pays: Proposer (transaction fee)
- Signs: Proposer + Vault PDA (for transfer)
- Owns: Program (PendingWithdrawal closes)

**Critical: Vault PDA signing again** → Need vault_bump (already have it ✓)

---

### 3. `cancel_withdrawal`
**Signature:**
```rust
pub fn cancel_withdrawal(
    ctx: Context<CancelWithdrawal>,
) -> Result<()>
```

**Authorization Options (need to decide):**
- Option A: Only proposer can cancel
- Option B: Proposer OR admin can cancel
- Option C: Anyone can cancel (weird)

**Decision needed**: B makes most sense (proposer changes mind, or admin emergency stop)

**State changes:**
- Close PendingWithdrawal account (reclaim rent)
- Emit WithdrawalCancelled event

---

### 4. Update `withdraw` instruction
**Current**: Direct withdrawal
**New**: Check amount vs threshold
- If `amount <= threshold` → Execute immediately (current behavior)
- If `amount > threshold` → Fail with "UseProposeWithdrawal" error

---

## Phase 6: Edge Cases & Failure Modes

**What can go wrong?**

1. **Timelock not expired**
   - Error: `TimelockNotExpired { remaining_seconds: u64 }`

2. **Vault insufficient balance at execution**
   - Error: `InsufficientVaultBalance { available: u64, requested: u64 }`
   - Decision: Fail cleanly, user must cancel and re-propose

3. **User role changed during timelock**
   - Decision: Use role at proposal time (stored in PendingWithdrawal)
   - Rationale: They had permission when they proposed

4. **User removed during timelock**
   - Decision: Still allow execution (they proposed when authorized)
   - Or: Check at execution time (stricter)
   - **Need to decide**: What's the compliance requirement?

5. **Clock manipulation**
   - Solana clock can drift slightly between validators
   - Use Clock syscall (standard approach)
   - Accept minor variance (< 1 minute is acceptable)

6. **Multiple pending withdrawals**
   - Allowed: User can propose multiple if total doesn't exceed limit
   - Or: Only allow one pending at a time
   - **Decision needed**: What's the business logic?

---

## Phase 7: Testing Strategy

**Integration tests needed:**
1. `propose_withdrawal` → verify account created, counter incremented
2. `execute_withdrawal` before timelock → fails with TimelockNotExpired
3. `execute_withdrawal` after timelock → succeeds, balance updated
4. `cancel_withdrawal` → account closed, rent reclaimed
5. `withdraw` with large amount → fails with UseProposeWithdrawal
6. `withdraw` with small amount → succeeds immediately
7. Multiple pending withdrawals → both can execute independently
8. Execute after cancel → fails (account doesn't exist)

---

## Phase 8: Open Questions (MUST DECIDE BEFORE CODING)

1. **Who pays rent for PendingWithdrawal?**
   - Proposer? (they benefit)
   - Treasury? (it's system overhead)

2. **Can user have multiple pending withdrawals?**
   - Yes (flexible)
   - No (simpler)

3. **Cancellation authority?**
   - Proposer only (strict)
   - Proposer OR admin (flexible)

4. **Role check timing?**
   - At proposal (permissive)
   - At execution (strict)

5. **Threshold configuration?**
   - Set at treasury init (immutable)
   - Add update_threshold instruction (mutable)

---

## Phase 9: Implementation Order

**Recommended sequence:**
1. Update Treasury struct (add threshold, timelock, counter)
2. Create PendingWithdrawal struct
3. Implement `propose_withdrawal` (+ tests)
4. Implement `execute_withdrawal` (+ tests)
5. Implement `cancel_withdrawal` (+ tests)
6. Update `withdraw` to check threshold (+ tests)
7. Integration test: full flow propose → wait → execute

**Why this order?**
- Builds from data → logic
- Tests each piece independently
- Integration test confirms everything works together

---

## Applying Engineering Principles

**From ENGINEERING_PRINCIPLES.md:**

✅ **State Transition Thinking**: Drew the state machine first
✅ **Authority Triad**: Answered for each account
✅ **Account Lifecycle**: Planned birth/life/death
✅ **Composability**: Using Clock syscall (standard), not custom time
✅ **Type-Driven**: Using Rust enums for Role (already exists)
✅ **Test Invariants**: Listed system invariants to verify
✅ **SWOT**: Did SWOT for PDA design decision

**Still need:**
- Answer open questions before coding
- Draw the full state diagram
- Write error codes enum
- Calculate all account spaces

---

## Next Steps

**BEFORE writing any code:**
1. Review this design doc
2. Answer open questions (decide on trade-offs)
3. Get alignment on business logic (multiple pending? strict role checks?)
4. Draw final state diagram
5. Write error codes enum

**THEN start implementation** following the order above.

---

**For Future LLM:**
If you're implementing Week 2 and haven't read this document, STOP. Read it first. The design decisions matter more than the code.
