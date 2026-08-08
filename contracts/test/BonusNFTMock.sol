// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IBonusNFT} from "../liquidity/interfaces/IBonusNFT.sol";

/**
 * @notice Minimal ERC721 with a configurable farming bonus fraction for tests.
 */
contract BonusNFTMock is ERC721, IBonusNFT {
    uint256 public immutable bonusNumerator;
    uint256 public immutable bonusDenominator;
    uint256 private _nextTokenId = 1;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 bonusNumerator_,
        uint256 bonusDenominator_
    ) ERC721(name_, symbol_) {
        bonusNumerator = bonusNumerator_;
        bonusDenominator = bonusDenominator_;
    }

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = _nextTokenId;
        unchecked {
            _nextTokenId = tokenId + 1;
        }
        _safeMint(to, tokenId);
    }
}
