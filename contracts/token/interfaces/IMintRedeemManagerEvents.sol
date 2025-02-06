// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase  */
/* solhint-disable func-param-name-mixedcase  */

interface IMintRedeemManagerEvents {
    /// @notice Event emitted when contract receives ETH
    event Received(address, uint256);

    /// @notice Event for signaling emergency mode status
    event MintRedeemManagerEmergencyStatus(bool status);

    /// @notice Event emitted when USDO is minted
    event Mint(
        address indexed minter,
        address indexed benefactor,
        address indexed beneficiary,
        address collateral_usdc,
        address collateral_usdt,
        uint256 collateral_usdc_amount,
        uint256 collateral_usdt_amount,
        uint256 usdo_amount
    );

    /// @notice Event emitted when funds are redeemed
    event Redeem(
        address indexed redeemer,
        address indexed benefactor,
        address indexed beneficiary,
        address collateral_usdc,
        address collateral_usdt,
        uint256 collateral_usdc_amount,
        uint256 collateral_usdt_amount,
        uint256 usdo_amount
    );

    /// @notice Event emitted when assets are moved to custody provider wallet
    event CustodyTransfer(
        address indexed wallet,
        address indexed asset,
        uint256 amount
    );

    /// @notice Event emitted when the max mint per block is changed
    event MaxMintPerBlockChanged(
        uint256 oldMaxMintPerBlock,
        uint256 newMaxMintPerBlock
    );

    /// @notice Event emitted when the max redeem per block is changed
    event MaxRedeemPerBlockChanged(
        uint256 oldMaxRedeemPerBlock,
        uint256 newMaxRedeemPerBlock
    );

    /// @notice Event emitted when collateral has been supplied to the backing contract
    event SuppliedToBacking(
        address indexed supplier,
        uint256 amountUsdc,
        uint256 amountUsdt
    );
}
