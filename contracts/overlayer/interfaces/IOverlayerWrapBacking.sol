// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

interface IOverlayerWrapBacking {
    function supply(uint256 amount, address collateral) external;
    function withdraw(uint256 amount, address collateral) external;
}
