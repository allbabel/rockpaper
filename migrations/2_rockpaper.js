const RockPaper = artifacts.require("RockPaper");

module.exports = function(deployer) {
  deployer.deploy(RockPaper);
};
