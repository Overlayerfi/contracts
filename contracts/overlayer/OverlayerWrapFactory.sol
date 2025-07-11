// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "./OverlayerWrap.sol";
import "./interfaces/IOverlayerWrapDefs.sol";
import "../shared/SingleAdminAccessControl.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract OverlayerWrapFactory is SingleAdminAccessControl {
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");

    // Prevent duplicate symbols and allow lookup
    mapping(string => address) public symbolToToken;

    event OverlayerWrapDeployed(
        address indexed token,
        string name,
        string symbol
    );

    constructor(address admin, address governor) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNOR_ROLE, governor);
    }

    function deployOverlayerWrap(
        string memory name,
        string memory symbol,
        MintRedeemManagerTypes.StableCoin memory collateral_,
        MintRedeemManagerTypes.StableCoin memory aCollateral_,
        uint256 maxMintPerBlock_,
        uint256 maxRedeemPerBlock_
    ) external onlyRole(GOVERNOR_ROLE) returns (address) {
        // Reject if symbol already exists
        if (symbolToToken[symbol] != address(0)) {
            revert SymbolAlreadyExists(symbol);
        }
        IOverlayerWrapDefs.ConstructorParams memory params = IOverlayerWrapDefs
            .ConstructorParams(
                owner(),
                name,
                symbol,
                collateral_,
                aCollateral_,
                maxMintPerBlock_,
                maxRedeemPerBlock_
            );
        OverlayerWrap token = new OverlayerWrap(params);

        symbolToToken[symbol] = address(token);

        emit OverlayerWrapDeployed(address(token), name, symbol);
        return address(token);
    }

    error SymbolAlreadyExists(string symbol);
}
