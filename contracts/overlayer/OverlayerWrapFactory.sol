// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "./OverlayerWrap.sol";
import "./interfaces/IOverlayerWrapDefs.sol";
import "../shared/SingleAdminAccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OverlayerWrapFactory is Ownable {
    address public governor;

    // Prevent duplicate symbols and allow lookup
    mapping(string => address) public symbolToToken;

    error ZeroAddressNotAllowed();

    error OnlyGovernor();

    error SymbolAlreadyExists(string symbol);

    event OverlayerWrapDeployed(
        address indexed token,
        string name,
        string symbol
    );

    constructor(address admin_, address governor_) Ownable(admin_) {
        if (admin_ == address(0) || governor_ == address(0)) {
            revert ZeroAddressNotAllowed();
        }
        governor = governor_;
    }

    function deployInitialOverlayerWrap(
        OverlayerWrapCoreTypes.StableCoin memory collateral_,
        OverlayerWrapCoreTypes.StableCoin memory aCollateral_,
        address lzEndpoint_,
        uint256 maxMintPerBlock_,
        uint256 maxRedeemPerBlock_,
        uint256 hubChainId_
    ) external onlyOwner returns (address) {
        // Reject if symbol already exists
        string memory overlayerZeroSymbol = "USDT+";
        string memory overlayerZeroName = "Tether USD+";
        if (symbolToToken[overlayerZeroSymbol] != address(0)) {
            revert SymbolAlreadyExists(overlayerZeroSymbol);
        }
        IOverlayerWrapDefs.ConstructorParams memory params = IOverlayerWrapDefs
            .ConstructorParams(
                owner(),
                lzEndpoint_,
                overlayerZeroName,
                overlayerZeroSymbol,
                collateral_,
                aCollateral_,
                maxMintPerBlock_,
                maxRedeemPerBlock_,
                hubChainId_
            );
        OverlayerWrap token = new OverlayerWrap(params);

        symbolToToken[overlayerZeroSymbol] = address(token);

        emit OverlayerWrapDeployed(
            address(token),
            overlayerZeroName,
            overlayerZeroSymbol
        );
        return address(token);
    }

    function deployOverlayerWrap(
        string memory name_,
        string memory symbol_,
        OverlayerWrapCoreTypes.StableCoin memory collateral_,
        OverlayerWrapCoreTypes.StableCoin memory aCollateral_,
        address lzEndpoint_,
        uint256 maxMintPerBlock_,
        uint256 maxRedeemPerBlock_,
        uint256 hubChainId_
    ) external returns (address) {
        if (msg.sender != governor) {
            revert OnlyGovernor();
        }
        // Reject if symbol_ already exists
        if (symbolToToken[symbol_] != address(0)) {
            revert SymbolAlreadyExists(symbol_);
        }
        IOverlayerWrapDefs.ConstructorParams memory params = IOverlayerWrapDefs
            .ConstructorParams(
                owner(),
                lzEndpoint_,
                name_,
                symbol_,
                collateral_,
                aCollateral_,
                maxMintPerBlock_,
                maxRedeemPerBlock_,
                hubChainId_
            );
        OverlayerWrap token = new OverlayerWrap(params);

        symbolToToken[symbol_] = address(token);

        emit OverlayerWrapDeployed(address(token), name_, symbol_);
        return address(token);
    }
}
