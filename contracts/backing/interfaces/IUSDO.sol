// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "../../token/types/MintRedeemManagerTypes.sol";

interface IUSDO {
    function acceptProposedCollateralSpender() external;
    function mint(MintRedeemManagerTypes.Order calldata order) external;
}
