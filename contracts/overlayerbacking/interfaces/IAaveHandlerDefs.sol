// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/// @title Interface for Aave Handler Definitions
/// @notice Defines events and errors for Aave integration handling
interface IAaveHandlerDefs {
    /// @notice Error thrown when overlayer wrap total supply is too low
    error AaveHandlerOverlayerWrapTotalSupplyTooLow();

    /// @notice Error thrown when a zero address is provided
    error AaveHandlerZeroAddressException();

    /// @notice Error thrown when same address is provided for different parameters
    error AaveHandlerSameAddressException();

    /// @notice Error thrown when attempting to renounce ownership
    error AaveHandlerCantRenounceOwnership();

    /// @notice Error thrown when operation is not permitted
    error AaveHandlerOperationNotAllowed();

    /// @notice Error thrown when caller is not OverlayerWrap contract
    error AaveHandlerCallerIsNotOverlayerWrap();

    /// @notice Error thrown when amount does not match expected value
    error AaveHandlerUnexpectedAmount();

    /// @notice Error thrown when Aave withdrawal fails
    error AaveHandlerAaveWithrawFailed();

    /// @notice Error thrown when invalid collateral is provided
    error AaveHandlerInvalidCollateral();

    /// @notice Error thrown when balance is insufficient for operation
    error AaveHandlerInsufficientBalance();

    /// @notice Error thrown when aToken balance is insufficient
    error AaveHandlerInsufficientABalance();

    /// @notice Error thrown when time interval requirement is not met
    error AaveIntervalNotRespected();

    /// @notice Emitted when an Aave action fails with details
    event AaveActionFailed(string message, bytes reason);

    /// @notice Emitted when tokens are withdrawn from Aave
    event AaveWithdraw(uint256 usdt);

    /// @notice Emitted when tokens are supplied to Aave
    event AaveSupply(uint256 usdt);

    /// @notice Emitted when new Aave contract address is set
    event AaveNewAave(address indexed addr);

    /// @notice Emitted when team allocation percentage changes
    event AaveNewTeamAllocation(uint8 amount);

    /// @notice Emitted when rewards dispatcher address changes
    event AaveNewRewardsDispatcher(address indexed addr);

    /// @notice Emitted when position is swapped
    event AaveSwapPosition(uint256 usdt, uint256 out);
}
