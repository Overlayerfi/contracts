import {deployFixedSupplyToken} from '../../functions';

deployFixedSupplyToken(1000000, "", "").catch(error => {
  console.log(error);
  console.log("🛑 Deployment failed");
  process.exit(1);
});
