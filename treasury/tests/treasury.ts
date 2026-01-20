import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Treasury } from "../target/types/treasury";
import { assert } from "chai";

describe("treasury", () => {
  // Configure the client to use the devnet cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.treasury as Program<Treasury>;
  const provider = anchor.getProvider();

  // Test accounts
  const admin = (provider.wallet as anchor.Wallet).payer;

  // Derive the treasury PDA
  const [treasuryPda, treasuryBump] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), admin.publicKey.toBuffer()],
    program.programId
  );

  // Derive the vault PDA
  const [vaultPda, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), treasuryPda.toBuffer()],
    program.programId
  );

  it("Initializes the treasury", async () => {
    const tx = await program.methods
      .initialize(treasuryBump, vaultBump)
      .accounts({
        treasury: treasuryPda,
        treasuryVault: vaultPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Treasury initialized, tx signature:", tx);

    // Fetch the treasury account to verify
    const treasuryAccount = await program.account.treasury.fetch(treasuryPda);
    assert.ok(treasuryAccount.admin.equals(admin.publicKey));
    console.log("Treasury admin:", treasuryAccount.admin.toString());
  });

  it("Adds a user with Manager role", async () => {
    // Create a new keypair for the user
    const newUser = anchor.web3.Keypair.generate();

    // Derive the user account PDA
    const [userAccountPda, userBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), treasuryPda.toBuffer(), newUser.publicKey.toBuffer()],
      program.programId
    );

    const spendingLimit = new anchor.BN(100_000_000); // 0.1 SOL in lamports

    const tx = await program.methods
      .addUser({ manager: {} }, spendingLimit) // Role enum as object
      .accounts({
        treasury: treasuryPda,
        userAccount: userAccountPda,
        newUser: newUser.publicKey,
        authority: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("User added, tx signature:", tx);

    // Fetch the user account to verify
    const userAccount = await program.account.userAccount.fetch(userAccountPda);
    assert.ok(userAccount.user.equals(newUser.publicKey));
    assert.equal(userAccount.spendingLimit.toNumber(), spendingLimit.toNumber());
    console.log("User added:", userAccount.user.toString());
    console.log("Role:", userAccount.role);
    console.log("Spending limit:", userAccount.spendingLimit.toNumber(), "lamports");
  });

  it("Funds the treasury vault", async () => {
    // Fund the vault with 1 SOL so we can test withdrawals
    const fundAmount = 1_000_000_000; // 1 SOL in lamports

    const tx = await provider.connection.requestAirdrop(
      vaultPda,
      fundAmount
    );
    await provider.connection.confirmTransaction(tx);

    const vaultBalance = await provider.connection.getBalance(vaultPda);
    console.log("Vault funded with:", vaultBalance, "lamports");
    assert.ok(vaultBalance >= fundAmount);
  });

  it("Withdraws SOL within spending limit", async () => {
    // Create a user with spending limit
    const user = anchor.web3.Keypair.generate();
    const spendingLimit = new anchor.BN(50_000_000); // 0.05 SOL

    // Derive the user account PDA
    const [userAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), treasuryPda.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    // Add the user first
    await program.methods
      .addUser({ member: {} }, spendingLimit)
      .accounts({
        treasury: treasuryPda,
        userAccount: userAccountPda,
        newUser: user.publicKey,
        authority: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Create recipient and get initial balance
    const recipient = anchor.web3.Keypair.generate();
    const withdrawAmount = new anchor.BN(30_000_000); // 0.03 SOL (within limit)

    // Get balance before withdrawal
    const vaultBalanceBefore = await provider.connection.getBalance(vaultPda);

    // Perform withdrawal
    const tx = await program.methods
      .withdraw(withdrawAmount)
      .accounts({
        treasury: treasuryPda,
        treasuryVault: vaultPda,
        userAccount: userAccountPda,
        recipient: recipient.publicKey,
        authority: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    console.log("Withdrawal successful, tx signature:", tx);

    // Verify balances changed
    const vaultBalanceAfter = await provider.connection.getBalance(vaultPda);
    const recipientBalance = await provider.connection.getBalance(recipient.publicKey);

    assert.equal(vaultBalanceBefore - vaultBalanceAfter, withdrawAmount.toNumber());
    assert.equal(recipientBalance, withdrawAmount.toNumber());

    // Verify user account tracking
    const userAccount = await program.account.userAccount.fetch(userAccountPda);
    assert.equal(userAccount.totalWithdrawn.toNumber(), withdrawAmount.toNumber());

    console.log("Vault balance after:", vaultBalanceAfter);
    console.log("Recipient received:", recipientBalance, "lamports");
    console.log("User total withdrawn:", userAccount.totalWithdrawn.toNumber());
  });

  it("Fails to withdraw beyond spending limit", async () => {
    // Create a user with low spending limit
    const user = anchor.web3.Keypair.generate();
    const spendingLimit = new anchor.BN(10_000_000); // 0.01 SOL

    const [userAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), treasuryPda.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    // Add the user
    await program.methods
      .addUser({ member: {} }, spendingLimit)
      .accounts({
        treasury: treasuryPda,
        userAccount: userAccountPda,
        newUser: user.publicKey,
        authority: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const recipient = anchor.web3.Keypair.generate();
    const excessiveAmount = new anchor.BN(20_000_000); // 0.02 SOL (exceeds limit)

    // Attempt withdrawal that exceeds limit
    try {
      await program.methods
        .withdraw(excessiveAmount)
        .accounts({
          treasury: treasuryPda,
          treasuryVault: vaultPda,
          userAccount: userAccountPda,
          recipient: recipient.publicKey,
          authority: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      // If we get here, the test should fail
      assert.fail("Expected transaction to fail but it succeeded");
    } catch (err) {
      // Verify it's the right error
      assert.ok(err.toString().includes("ExceedsSpendingLimit"));
      console.log("Correctly rejected withdrawal exceeding limit");
    }
  });

  it("Fails when unauthorized user attempts withdrawal", async () => {
    // Create two users
    const authorizedUser = anchor.web3.Keypair.generate();
    const unauthorizedUser = anchor.web3.Keypair.generate();
    const spendingLimit = new anchor.BN(50_000_000);

    const [userAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), treasuryPda.toBuffer(), authorizedUser.publicKey.toBuffer()],
      program.programId
    );

    // Add only the authorized user
    await program.methods
      .addUser({ member: {} }, spendingLimit)
      .accounts({
        treasury: treasuryPda,
        userAccount: userAccountPda,
        newUser: authorizedUser.publicKey,
        authority: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const recipient = anchor.web3.Keypair.generate();
    const withdrawAmount = new anchor.BN(10_000_000);

    // Attempt withdrawal with wrong authority
    try {
      await program.methods
        .withdraw(withdrawAmount)
        .accounts({
          treasury: treasuryPda,
          treasuryVault: vaultPda,
          userAccount: userAccountPda,
          recipient: recipient.publicKey,
          authority: unauthorizedUser.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([unauthorizedUser])
        .rpc();

      assert.fail("Expected transaction to fail but it succeeded");
    } catch (err) {
      // Should fail with Unauthorized error
      assert.ok(err.toString().includes("Unauthorized"));
      console.log("Correctly rejected unauthorized withdrawal");
    }
  });
});
