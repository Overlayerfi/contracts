// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "../overlayer/OverlayerWrap.sol";

/// @dev Test-only contract that exposes internal OFT _debit/_credit for unit testing
contract OverlayerWrapMock is OverlayerWrap {
    constructor(ConstructorParams memory params_) OverlayerWrap(params_) {}

    function testDebit(
        address from_,
        uint256 amountLD_,
        uint256 minAmountLD_,
        uint32 dstEid_
    ) external returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        return _debit(from_, amountLD_, minAmountLD_, dstEid_);
    }

    function testCredit(
        address to_,
        uint256 amountLD_,
        uint32 srcEid_
    ) external returns (uint256 amountReceivedLD) {
        return _credit(to_, amountLD_, srcEid_);
    }
}
