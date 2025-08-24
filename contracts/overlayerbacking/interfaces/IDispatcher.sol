// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/// @title Interface for Rewards Dispatcher
/// @notice Defines dispatch functionality for rewards distribution
interface IDispatcher {
    /// @notice Dispatches rewards to eligible recipients
    function dispatch() external;
}
