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
        MintRedeemManagerTypes.StableCoin memory collateral_,
        MintRedeemManagerTypes.StableCoin memory aCollateral_,
        address lzEndpoint_,
        uint256 maxMintPerBlock_,
        uint256 maxRedeemPerBlock_
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
                maxRedeemPerBlock_
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
        string memory name,
        string memory symbol,
        MintRedeemManagerTypes.StableCoin memory collateral_,
        MintRedeemManagerTypes.StableCoin memory aCollateral_,
        address lzEndpoint_,
        uint256 maxMintPerBlock_,
        uint256 maxRedeemPerBlock_
    ) external returns (address) {
        if (msg.sender != governor) {
            revert OnlyGovernor();
        }
        // Reject if symbol already exists
        if (symbolToToken[symbol] != address(0)) {
            revert SymbolAlreadyExists(symbol);
        }
        IOverlayerWrapDefs.ConstructorParams memory params = IOverlayerWrapDefs
            .ConstructorParams(
                owner(),
                lzEndpoint_,
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
}
