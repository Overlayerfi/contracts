// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

contract TestMath {
    receive() external payable {}
    function testMod(uint256 a, uint256 b) public pure returns (uint256 res) {
        res = a % b;
    }
}
