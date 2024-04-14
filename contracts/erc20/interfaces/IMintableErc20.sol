// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMintableERC20 {
	function mint(uint _amount) external returns (uint);
	
	function burn(uint _amount) external returns (uint);
}
