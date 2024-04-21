// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IStakingRewardsDistributor {
    // Events //
    /// @notice Event emitted when tokens are rescued by owner
    event TokensRescued(
        address indexed token,
        address indexed to,
        uint256 amount
    );
    /// @notice This event is fired when the operator changes
    event OperatorUpdated(
        address indexed newOperator,
        address indexed previousOperator
    );

    // Errors //
    /// @notice Error emitted when there is not a single asset at constructor time
    error NoAssetsProvided();
    /// @notice Error emitted when the address(0) is passed as an argument
    error InvalidZeroAddress();
    /// @notice Error emitted when the amount is equal to 0
    error InvalidAmount();
    /// @notice Error returned when native ETH transfer fails
    error TransferFailed();
    /// @notice It's not possible to renounce the ownership
    error CantRenounceOwnership();
    /// @notice Only the current operator can perform an action
    error OnlyOperator();
    /// @notice Insufficient funds to transfer to the staking contract
    error InsufficientFunds();

    function transferInRewards(
        uint256 amountUsdc,
        uint256 amountUsdt,
        uint256 amountUsdx
    ) external;

    function rescueTokens(
        address _token,
        address _to,
        uint256 _amount
    ) external;

    function setOperator(address _newOperator) external;
}
