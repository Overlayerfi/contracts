// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

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
    /// @notice Error emitted when blakclist time is not valid
    error StakedOverlayerWrapInvalidTime();

    function transferInRewards(uint256 amount) external;

    function rescueTokens(address token, uint256 amount, address to) external;

    function getUnvestedAmount() external view returns (uint256);
}
