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
      .initialize(treasuryBump)
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
});
