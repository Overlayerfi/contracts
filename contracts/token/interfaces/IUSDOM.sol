// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import '../types/MintRedeemManagerTypes.sol';

interface IUSDOM {
    function mint(MintRedeemManagerTypes.Order calldata order) external;

    function redeem(MintRedeemManagerTypes.Order calldata order) external;
}
