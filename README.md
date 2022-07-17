
# Warden v2



## Overview

Warden v2 smart contracts

TO DO: basic explanations

& contracts deploy addresses


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


### Foundry

To install Foundry
```
curl -L https://foundry.paradigm.xyz | bash
npm run setup-foundry
forge install dapphub/ds-test
forge install brockelmore/forge-std
```


## Contracts


[Contrect_Name](github_link_to_contract)  


## Tests

Tests can be found in the `./test` directory.

To run the tests : 
```
npm run test
```


## Fuzzing

Unit tests can be found in the `./src/test` directory.

To run the tests : 
```
npm run test-fuzz
```


## Deploy


Deploy to Mainnet :
```
npm run build
npm run deploy <path_to_deploy_script>
```


## Security & Audit


pending


## Ressources


Website : [paladin.vote](https://.paladin.vote)

Documentation : [doc.paladin.vote](https://doc.paladin.vote)


## Community

For any question about this project, or to engage with us :

[Twitter](https://twitter.com/Paladin_vote)

[Discord](https://discord.com/invite/esZhmTbKHc)



## License


This project is licensed under the [MIT](https://github.com/PaladinFinance/Paladin-Evocations/blob/main/MIT-LICENSE.TXT) license


