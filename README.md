
# Warden v2



## Overview

Warden v2 smart contracts

Warden is a market for Delegation Boost of votingEscrow (ex : veCRV) type tokens

Delegators need to approve the Warden contract as an operator in the DelegationBoost contract, then they can register in Warden, setting a price, a minimum %, and a maximum %, a maximum duration, and an expiry date for their votingEscrow tokens.
Buyer can then pay to get a DelegationBoost from the delegator, for a given amount and a given duration depending on the amount of fees willing to be paid (duration are currently counted by weeks).
All fees paid to buy DelegationBoosts are paid in the votingEscrow underlying token (ex: for veCRV, fees paid in CRV)
Delegator can claim fees they earned through the purchases of DelegationBoosts they originated.

Currently it only works with Delegation Boost made for CRV rewards on Curve Gauges.

Because the veBoost contract rounds down to the week the _endtime given to create a Boost, users buying a Boost through Warden could get less days of Boost than what they paid for. So it does not happen, when creating a Boost, the Warden contract will add 1 more week to the calculations if needed, to the _endtime parameter to create the Boost, to reach a correct _endtime. This added days are counted in the amount of fees to pay when purchasing the Boost (and also accoutned for when estimating the fees to pay).  


## Deployed contracts

Warden: 0xA04A36614e4C1Eb8cc0137d6d34eaAc963167828  

WardenMultiBuy: 0x4772ca88A5BFA9d196472b208566fee948D272B3  


## Dependencies & Installation


To start, make sure you have `node` & `npm` installed : 
* `node` - tested with v16.4.0
* `npm` - tested with v7.18.1

Then, clone this repo, and install the dependencies : 

```
git clone https://github.com/PaladinFinance/Warden-v2.git
cd Warden-v2
npm install
```

This will install `Hardhat`, `Ethers v5`, and all the hardhat plugins used in this project.


## Contracts


[Warden](https://github.com/PaladinFinance/Warden-v2/blob/main/contracts/Warden.sol)  
[WardenMultiBuy](https://github.com/PaladinFinance/Warden-v2/blob/main/contracts/WardenMultiBuy.sol)  


## Tests

Tests can be found in the `./test` directory.

To run the tests : 
```
npm run test
```


## Deploy


Deploy to Mainnet :
```
npm run build
npm run deploy <path_to_deploy_script>
```


## Security & Audit


...


## Ressources


Website : [paladin.vote](https://.paladin.vote)

Documentation : [doc.paladin.vote](https://doc.paladin.vote)


## Community

For any question about this project, or to engage with us :

[Twitter](https://twitter.com/Paladin_vote)

[Discord](https://discord.com/invite/esZhmTbKHc)



## License


This project is licensed under the [MIT](https://github.com/PaladinFinance/Paladin-Evocations/blob/main/MIT-LICENSE.TXT) license


