// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '../MintableERC20.sol';

contract TokenReward is MintableERC20 {
    constructor(
        uint256 _initialSupply,
        string memory _name,
        string memory _symbol
    ) MintableERC20(_initialSupply, _name, _symbol) {}
}
