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
        address collateral,
        uint256 collateral_amount,
        uint256 usdo_amount
    );

    /// @notice Event emitted when funds are redeemed
    event Redeem(
        address indexed redeemer,
        address indexed benefactor,
        address indexed beneficiary,
        address collateral,
        uint256 collateral_amount,
        uint256 usdo_amount
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
        uint256 amount
    );
}
