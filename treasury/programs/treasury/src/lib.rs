use anchor_lang::prelude::*;

// This is your program's on-chain address - think of it as your contract's ID
declare_id!("2n1xgfAV4AfknWrffNS8ezdPE3iPtNHeJt1T6u5AR3eE");

#[program]
pub mod treasury {
    use super::*;

    // Instruction 1: Initialize the treasury
    // This creates the main treasury account and sets the admin
    pub fn initialize(ctx: Context<Initialize>, treasury_bump: u8) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;

        treasury.admin = ctx.accounts.admin.key();
        treasury.bump = treasury_bump;
        treasury.total_members = 0;

        msg!("Treasury initialized by admin: {}", ctx.accounts.admin.key());
        Ok(())
    }

    // Instruction 2: Add a user with a specific role
    pub fn add_user(
        ctx: Context<AddUser>,
        role: Role,
        spending_limit: u64,
    ) -> Result<()> {
        let treasury = &ctx.accounts.treasury;
        let user_account = &mut ctx.accounts.user_account;

        // Only admin can add users
        require!(
            ctx.accounts.authority.key() == treasury.admin,
            TreasuryError::Unauthorized
        );

        user_account.user = ctx.accounts.new_user.key();
        user_account.role = role;
        user_account.spending_limit = spending_limit;
        user_account.total_withdrawn = 0;

        msg!("User {} added with role {:?}", user_account.user, role);
        Ok(())
    }

    // Instruction 3: Withdraw from treasury
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let treasury = &ctx.accounts.treasury;

        // Check user has permission
        require!(
            ctx.accounts.authority.key() == user_account.user,
            TreasuryError::Unauthorized
        );

        // Check spending limit
        require!(
            amount <= user_account.spending_limit,
            TreasuryError::ExceedsSpendingLimit
        );

        // Transfer SOL from treasury vault to recipient
        let treasury_seeds = &[
            b"treasury",
            treasury.admin.as_ref(),
            &[treasury.bump],
        ];
        let signer_seeds = &[&treasury_seeds[..]];

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.treasury_vault.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
            },
            signer_seeds,
        );

        anchor_lang::system_program::transfer(cpi_context, amount)?;

        user_account.total_withdrawn += amount;

        msg!("Withdrawal of {} lamports by {}", amount, user_account.user);
        Ok(())
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

// The main Treasury account - holds configuration and admin info
#[account]
pub struct Treasury {
    pub admin: Pubkey,           // Who controls this treasury
    pub bump: u8,                // PDA bump seed (for security)
    pub total_members: u32,      // How many users have access
}

// Individual user account - tracks their role and spending
#[account]
pub struct UserAccount {
    pub user: Pubkey,            // The user's wallet address
    pub role: Role,              // Their permission level
    pub spending_limit: u64,     // Max they can withdraw (in lamports)
    pub total_withdrawn: u64,    // Running total of withdrawals
}

// ============================================================================
// ENUMS
// ============================================================================

// Role-based access control
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Role {
    Admin,      // Full control
    Manager,    // Can manage users
    Member,     // Basic withdrawal rights
}

// ============================================================================
// CONTEXT STRUCTURES (What accounts each instruction needs)
// ============================================================================

// Context for Initialize instruction
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 1 + 4,
        seeds = [b"treasury", admin.key().as_ref()],
        bump
    )]
    pub treasury: Account<'info, Treasury>,

    // PDA vault that will hold the SOL
    #[account(
        mut,
        seeds = [b"vault", treasury.key().as_ref()],
        bump
    )]
    pub treasury_vault: SystemAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// Context for AddUser instruction
#[derive(Accounts)]
#[instruction(role: Role)]
pub struct AddUser<'info> {
    #[account(
        seeds = [b"treasury", treasury.admin.as_ref()],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,

    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 8 + 8,
        seeds = [b"user", treasury.key().as_ref(), new_user.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    /// CHECK: This is the user being added
    pub new_user: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// Context for Withdraw instruction
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [b"treasury", treasury.admin.as_ref()],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, Treasury>,

    #[account(
        mut,
        seeds = [b"vault", treasury.key().as_ref()],
        bump
    )]
    pub treasury_vault: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"user", treasury.key().as_ref(), user_account.user.as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    /// CHECK: Recipient of the withdrawal
    #[account(mut)]
    pub recipient: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ============================================================================
// ERROR CODES
// ============================================================================

#[error_code]
pub enum TreasuryError {
    #[msg("You don't have permission to perform this action")]
    Unauthorized,

    #[msg("Amount exceeds your spending limit")]
    ExceedsSpendingLimit,
}
