// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "./IStakedOverlayerWrap.sol";

/// @notice Structure to track user cooldown information
/// @param cooldownEnd Timestamp when the cooldown period ends
/// @param underlyingAmount Amount of underlying tokens in cooldown
struct UserCooldown {
    uint104 cooldownEnd;
    uint152 underlyingAmount;
}

/// @title Interface for Staked Overlayer Wrap with Cooldown functionality
/// @notice Defines the cooldown mechanism for staked tokens
interface IStakedOverlayerWrapCooldown is IStakedOverlayerWrap {
    // Events //
    /// @notice Event emitted when cooldown duration updates
    event IStakedOverlayerWrapCooldownDurationUpdated(
        uint24 previousDuration,
        uint24 newDuration
    );

    // Errors //
    /// @notice Error emitted when the shares amount to redeem is greater than the shares balance of the owner
    error IStakedOverlayerWrapCooldownExcessiveRedeemAmount();
    /// @notice Error emitted when the shares amount to withdraw is greater than the shares balance of the owner
    error IStakedOverlayerWrapCooldownExcessiveWithdrawAmount();
    /// @notice Error emitted when cooldown value is invalid
    error IStakedOverlayerWrapCooldownInvalidCooldown();

    /// @notice Initiates cooldown period for a specified amount of assets
    /// @param assets Amount of assets to put in cooldown
    /// @return shares Amount of shares corresponding to the assets
    function cooldownAssets(uint256 assets) external returns (uint256 shares);

    /// @notice Initiates cooldown period for a specified amount of shares
    /// @param shares Amount of shares to put in cooldown
    /// @return assets Amount of assets corresponding to the shares
    function cooldownShares(uint256 shares) external returns (uint256 assets);

    /// @notice Completes the unstaking process after cooldown period
    /// @param receiver Address to receive the unstaked tokens
    function unstake(address receiver) external;

    /// @notice Updates the duration of the cooldown period
    /// @param duration New cooldown duration in seconds
    function setCooldownDuration(uint24 duration) external;
}
