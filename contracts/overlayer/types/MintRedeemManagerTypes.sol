// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase  */

library MintRedeemManagerTypes {
    struct Order {
        address benefactor;
        address beneficiary;
        address collateral;
        uint256 collateral_amount;
        uint256 overlayerWrap_amount;
    }

    struct StableCoin {
        address addr;
        uint256 decimals;
    }
}
