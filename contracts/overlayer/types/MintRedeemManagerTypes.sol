// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase  */

library MintRedeemManagerTypes {
    struct Order {
        address benefactor;
        address beneficiary;
        address collateral;
        uint256 collateralAmount;
        uint256 overlayerWrapAmount;
    }

    struct StableCoin {
        address addr;
        uint256 decimals;
    }
}
