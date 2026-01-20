# Solana Development Workflow

## Mandatory Flow

**Local → Surfpool → Devnet → Mainnet**

Never skip steps.

---

## 1. LOCAL (Development)

```toml
# Anchor.toml
cluster = "localnet"
```

```bash
# Every code change:
anchor build
anchor test

# Repeat until tests pass
```

**Exit:** `anchor build` succeeds + `anchor test` passes

---

## 2. SURFPOOL (Pre-Deploy Validation)

```bash
# Before ANY devnet deploy:
anchor build
surfpool simulate \
  --program target/deploy/treasury.so \
  --instruction <INSTRUCTION_NAME> \
  --accounts <ACCOUNTS_ARRAY>
```

**Exit:** Simulations pass, state changes correct

---

## 3. DEVNET (Integration)

```toml
# Anchor.toml
cluster = "devnet"
```

```bash
solana balance  # Check ~2 SOL minimum
anchor deploy
anchor test --skip-local-validator
```

**Cost:** ~1.5-2 SOL first deploy, ~0.5-1 SOL upgrades

**Redeploy when:**
- Logic changes
- New instructions
- Bug fixes
- Account structure changes

**Don't redeploy for:**
- Test file changes
- Frontend changes
- Docs updates

---

## 4. MAINNET (Production)

```toml
# Anchor.toml
cluster = "mainnet"
```

```bash
anchor deploy  # COSTS REAL MONEY (~2-5 SOL)
```

**Only after:** Weeks of devnet stability, security audit, team approval

---

## Decision Tree

```
Code change?
  ↓
anchor build (success?)
  ↓
anchor test (pass?)
  ↓
surfpool simulate (pass?)
  ↓
anchor deploy to devnet (pass?)
  ↓
[OPTIONAL] mainnet
```

---

## Quick Reference

| Stage | Tool | Cost | When |
|-------|------|------|------|
| Dev | Local | Free | Always first |
| Validate | Surfpool | Free | Before devnet |
| Integrate | Devnet | Fake SOL | Before mainnet |
| Prod | Mainnet | Real SOL | Final only |

---

## Surfpool Rules

**Use when:**
- Local tests pass
- Before EVERY devnet deploy
- Testing multi-instruction flows

**Don't use for:**
- Initial development
- Compilation errors
- Simple unit tests

---

## Environment Switch

```toml
# Anchor.toml line 15:
cluster = "localnet"   # Development
cluster = "devnet"     # Integration
cluster = "mainnet"    # Production
```

```bash
# Verify:
solana config get
```

---

## Troubleshooting

**Devnet rate-limited?**
1. Wait 10-15 min
2. Use https://faucet.solana.com
3. Switch to local

**Deploy fails?**
1. `anchor build` works?
2. `solana balance` > 2 SOL?
3. Surfpool passed?

---

## Current Status

- **Environment:** Localnet (recommended)
- **Devnet:** Ready (needs SOL)
- **Mainnet:** Not deployed
