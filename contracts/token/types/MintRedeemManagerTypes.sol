// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase  */

library MintRedeemManagerTypes {
    struct Order {
        address benefactor;
        address beneficiary;
        address collateral_usdt;
        address collateral_usdc;
        uint256 collateral_usdt_amount;
        uint256 collateral_usdc_amount;
        uint256 usdo_amount;
    }

    struct StableCoin {
        address addr;
        uint256 decimals;
    }
}
