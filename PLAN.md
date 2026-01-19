# 4-Week Solana Smart Contract Roadmap: Role-Based Treasury with Compliance

## Week 1: Build a Role-Based Treasury (Your Foundation)

### What you're building:
A treasury contract where:
- Different roles have different permissions (Admin, Manager, Member)
- Each role has spending limits
- All actions are logged immutably on-chain

### What you'll learn:
- Anchor account structures
- Enums for roles
- PDAs for the treasury vault
- Basic access control patterns
- Event logging

### Your tasks:
1. Set up Anchor project
2. Define your accounts (Treasury, User, Action Log)
3. Write instructions: initialize, add_user, withdraw
4. Implement role checks in each instruction
5. Deploy to devnet and test with Anchor tests

**Use AI heavily here - ask it to generate the skeleton, then make you understand each piece.**

---

## Week 2: Add Time-Based Compliance Rules

### What you're adding:
- Withdrawals over X amount require a 24-48hr timelock
- Scheduled withdrawals that can be cancelled during timelock
- Emergency override mechanism (with higher permission requirements)

### What you'll learn:
- Working with Unix timestamps on Solana
- Two-step transaction patterns (propose → execute)
- Cancellable pending actions
- Clock syscall

### Your tasks:
1. Create a PendingWithdrawal account type
2. Add propose_withdrawal instruction
3. Add execute_withdrawal instruction (with time check)
4. Add cancel_withdrawal instruction
5. Test the timelock enforcement

---

## Week 3: Build Spending Limits & Audit Trail

### What you're adding:
- Per-role daily/weekly spending limits
- Running totals that reset on time periods
- Comprehensive event emission for every action

### What you'll learn:
- State management across time periods
- Counter patterns and resets
- Event design for external indexing
- How to structure data for queries

### Your tasks:
1. Add spending tracker to user accounts
2. Implement limit checks before withdrawals
3. Add time-period reset logic
4. Emit detailed events with all relevant data
5. Write tests that verify limits work across multiple transactions

---

## Week 4: Advanced Compliance Features

### Pick 2-3 of these based on what interests you:
- **Approval workflows:** Multi-step approvals required for certain actions
- **Jurisdiction rules:** Whitelist/blacklist based on wallet addresses
- **Conditional logic:** "Can only withdraw to pre-approved addresses"
- **Compliance reports:** Generate merkle proofs of historical actions
- **Integration:** Add SPL token support (not just SOL)

---

## What happens after:

By week 4, you'll have:
- A working, non-trivial smart contract
- Understanding of real compliance patterns
- Something you can actually show to businesses
- The building blocks for more complex systems

### Then you decide:
- Go deeper into compliance (add more features)
- Pivot to physical asset bridges (using what you learned)
- Build something completely different
- Start talking to potential customers
