// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/* solhint-disable var-name-mixedcase  */
/* solhint-disable func-param-name-mixedcase  */

interface IMintRedeemManagerEvents {
    /// @notice Event emitted when contract receives ETH
    /// @param sender The address that sent ETH
    /// @param amount The amount of ETH received
    event Received(address sender, uint256 amount);

    /// @notice Event for signaling emergency mode status
    /// @param status True if emergency mode is active, false otherwise
    event MintRedeemManagerEmergencyStatus(bool status);

    /// @notice Event emitted when OverlayerWrap is minted
    /// @param minter The address initiating the mint
    /// @param benefactor The address providing the collateral
    /// @param beneficiary The address receiving the minted tokens
    /// @param collateral The collateral token address
    /// @param collateralAmount The amount of collateral provided
    /// @param overlayerWrapAmount The amount of OverlayerWrap minted
    event Mint(
        address indexed minter,
        address indexed benefactor,
        address indexed beneficiary,
        address collateral,
        uint256 collateralAmount,
        uint256 overlayerWrapAmount
    );

    /// @notice Event emitted when funds are redeemed
    /// @param redeemer The address initiating the redemption
    /// @param benefactor The address providing the OverlayerWrap tokens
    /// @param beneficiary The address receiving the collateral
    /// @param collateral The collateral token address
    /// @param collateralAmount The amount of collateral returned
    /// @param overlayerWrapAmount The amount of OverlayerWrap burned
    event Redeem(
        address indexed redeemer,
        address indexed benefactor,
        address indexed beneficiary,
        address collateral,
        uint256 collateralAmount,
        uint256 overlayerWrapAmount
    );

    /// @notice Event emitted when the max mint per block is changed
    /// @param oldMaxMintPerBlock The previous maximum mint amount per block
    /// @param newMaxMintPerBlock The new maximum mint amount per block
    event MaxMintPerBlockChanged(
        uint256 oldMaxMintPerBlock,
        uint256 newMaxMintPerBlock
    );

    /// @notice Event emitted when the max redeem per block is changed
    /// @param oldMaxRedeemPerBlock The previous maximum redeem amount per block
    /// @param newMaxRedeemPerBlock The new maximum redeem amount per block
    event MaxRedeemPerBlockChanged(
        uint256 oldMaxRedeemPerBlock,
        uint256 newMaxRedeemPerBlock
    );

    /// @notice Event emitted when collateral has been supplied to the backing contract
    /// @param supplier The address supplying the collateral
    /// @param amountCollateral The amount of collateral supplied
    /// @param amountACollateral The amount of aToken collateral received
    event SuppliedToBacking(
        address indexed supplier,
        uint256 amountCollateral,
        uint256 amountACollateral
    );
}
