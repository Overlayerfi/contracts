// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

interface IStakedUSDO {
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
    /// @notice Event emitted when the usdo backing contract is set
    event UsdoBackingSet(address indexed backing);
    /// @notice Error emitted shares or assets equal zero.
    error StakedUSDOInvalidAmount();
    /// @notice Error emitted when owner attempts to rescue USDO tokens.
    error StakedUSDOInvalidToken();
    /// @notice Error emitted when a small non-zero share amount remains, which risks donations attack
    error StakedUSDOMinSharesViolation();
    /// @notice Error emitted when owner is not allowed to perform an operation
    error StakedUSDOOperationNotAllowed();
    /// @notice Error emitted when there is still unvested amount
    error StakedUSDOStillVesting();
    /// @notice Error emitted when owner or blacklist manager attempts to blacklist owner
    error StakedUSDOCantBlacklistOwner();
    /// @notice Error emitted when the zero address is given
    error StakedUSDOInvalidZeroAddress();
    /// @notice Error emitted when blakclist time is not respected
    error StakedUSDOCannotBlacklist();
    /// @notice Error emitted when blakclist time is not valid
    error StakedUSDOInvalidTime();

    function transferInRewards(uint256 amount) external;

    function rescueTokens(address token, uint256 amount, address to) external;

    function getUnvestedAmount() external view returns (uint256);
}
