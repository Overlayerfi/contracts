import {deployFarm} from '../../functions';

deployFarm("", 0)
  .catch(error => {
    console.log(error);
    console.log("🛑 Deployment failed");
    process.exit(1);
});

