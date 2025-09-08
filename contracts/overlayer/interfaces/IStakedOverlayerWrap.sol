// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Interface for Staked Overlayer Wrap
/// @notice Defines core staking functionality and rewards management
interface IStakedOverlayerWrap {
    /// @notice Event emitted when the rewards are received
    event RewardsReceived(uint256 amount);
    /// @notice Event emitted when the balance from an WHOLE_RESTRICTED_ROLE user are redistributed
    event LockedAmountRedistributed(
        address indexed from,
        address indexed to,
        uint256 amount
    );
    /// @notice Event emitted when the blacklist timestamp is set
    event BlacklistTimeSet(uint256 time);
    /// @notice Event emitted when the overlayerWrap backing contract is set
    event OverlayerWrapBackingSet(address indexed backing);
    /// @notice Error emitted shares or assets equal zero.
    error StakedOverlayerWrapInvalidAmount();
    /// @notice Error emitted when owner attempts to rescue OverlayerWrap tokens.
    error StakedOverlayerWrapInvalidToken();
    /// @notice Error emitted when a small non-zero share amount remains, which risks donations attack
    error StakedOverlayerWrapMinSharesViolation();
    /// @notice Error emitted when owner is not allowed to perform an operation
    error StakedOverlayerWrapOperationNotAllowed();
    /// @notice Error emitted when there is still unvested amount
    error StakedOverlayerWrapStillVesting();
    /// @notice Error emitted when owner or blacklist manager attempts to blacklist owner
    error StakedOverlayerWrapCantBlacklistOwner();
    /// @notice Error emitted when the zero address is given
    error StakedOverlayerWrapInvalidZeroAddress();
    /// @notice Error emitted when blakclist time is not respected
    error StakedOverlayerWrapCannotBlacklist();
    /// @notice Error emitted when redistribute time is not respected
    error StakedOverlayerWrapCannotRedistribute();
    /// @notice Error emitted when blakclist time is not valid
    error StakedOverlayerWrapInvalidTime();

    /// @notice Transfers rewards to the staking contract
    /// @param amount Amount of rewards to transfer
    function transferInRewards(uint256 amount) external;

    /// @notice Allows rescue of tokens accidentally sent to the contract
    /// @param token Address of the token to rescue
    /// @param amount Amount of tokens to rescue
    /// @param to Address to receive the rescued tokens
    function rescueTokens(address token, uint256 amount, address to) external;

    /// @notice Returns the current unvested amount
    /// @return Amount of tokens that are still unvested
    function getUnvestedAmount() external view returns (uint256);
}
