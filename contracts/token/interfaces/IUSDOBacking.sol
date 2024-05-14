// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

interface IUSDOBacking {
    function supply(uint256 amountA, uint256 amountB) external;
    function withdraw(uint256 amountA, uint256 amountB) external;
}
