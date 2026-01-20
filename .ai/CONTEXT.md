# Treasury Smart Contract - Development Context

## Current State (2026-01-20)

**Program:** `treasury` - Role-based treasury with withdrawal limits
**Status:** Week 1 complete, tests passing, program deployed
**Program ID:** `HY44Fingwd4Wozs5fA2QrJUqKhoxmXWF5C8QUjjqMB4S`

### What's Built

**Smart Contract** (`programs/treasury/src/lib.rs` - 229 lines)
- ✅ Three instructions: `initialize`, `add_user`, `withdraw`
- ✅ PDA-based treasury vault for SOL custody
- ✅ Role enum: Admin, Manager, Member
- ✅ Per-user spending limits with tracking
- ✅ Authority checks (admin-only user addition)
- ✅ CPI for SOL transfers from vault

**Test Suite** (`tests/treasury.ts` - 256 lines)
- ✅ 6 tests, all passing
- ✅ Happy path: initialize → add user → fund → withdraw
- ✅ Adversarial: spending limit exceeded, unauthorized withdrawal

**Account Structure**
```
Treasury PDA: seeds = ["treasury", admin_pubkey]
Vault PDA:    seeds = ["vault", treasury_pda]
User PDA:     seeds = ["user", treasury_pda, user_pubkey]
```

### Recent Actions

**Last commit:** `c326cd3` - Initialize program keypair for all environments
**Environment:** Localnet configured, tests run via `anchor test`

---

## What's Next

### Immediate (Do Now)
Nothing blocked. System is stable.

### Week 2 Tasks (Time-based Compliance)
- [ ] Add `PendingWithdrawal` account (timelock state)
- [ ] Implement `propose_withdrawal` instruction
- [ ] Implement `execute_withdrawal` instruction (after timelock)
- [ ] Implement `cancel_withdrawal` instruction
- [ ] Add time validation (Clock sysvar)
- [ ] Test timelock flow end-to-end

### Design Questions for Week 2
Before implementing Week 2:
1. **Timelock duration:** Fixed (e.g., 24h) or per-role/per-amount?
2. **Who can cancel:** Proposer only, or admin override?
3. **Multiple pending:** Allow multiple pending withdrawals per user?
4. **Expiration:** Should proposals expire if not executed?

---

## Key Design Decisions

### Authority Model
- **Admin pays rent** for all accounts (treasury, vault, users)
- **Admin signs** for user additions
- **Users sign** for their own withdrawals
- **Vault PDA signs** for SOL transfers (CPI with seeds)

### Spending Limits
- Per-user, set at user creation
- Checked against withdrawal amount (not cumulative)
- No cooldown period (Week 1 scope)

### Account Space Calculations
```rust
Treasury:    8 + 32 + 1 + 1 + 4  = 46 bytes
UserAccount: 8 + 32 + 1 + 8 + 8  = 57 bytes
Vault:       System account (no custom data)
```

### Token Policy
- **Week 1-2:** Native SOL only
- **Token-2022:** Not yet addressed (defer to Week 3+)

---

## Known Gaps & Technical Debt

### Security (Not Yet Addressed)
- No replay protection (same withdrawal can't be proposed twice)
- No arithmetic overflow checks (using Rust defaults, need `checked_*`)
- No event emission (no audit trail yet)
- Vault bump stored but vault doesn't sign (harmless but inconsistent)

### Testing
- Unit tests only (no integration tests with devnet)
- No fuzzing or property-based tests
- No simulation with Surfpool yet

### Documentation
- No inline comments for "why" (only "what")
- No account relationship diagram
- No threat model documented

---

## Development Workflow

**Local Development:**
```bash
cd treasury
anchor build        # Compile
anchor test         # Run all tests
```

**Deployment Path:** Local → Surfpool → Devnet → Mainnet (not yet executed)

---

## Resources

**Wallet:**
- Devnet: `5pKyqGxAVyiSPj9PfxC9hEvUp5thYJNyHV6pCdWaHof2` (1 SOL)

**References:**
- See `.ai/RULES` for design principles
- Anchor Book: https://book.anchor-lang.com/
- Neodyme Security: https://workshop.neodyme.io/

---

*Last updated: 2026-01-20*
