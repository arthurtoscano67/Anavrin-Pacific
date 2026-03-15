import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { webEnv } from "../env";

export const publicSuiJsonRpcClient = new SuiJsonRpcClient({
  network: "mainnet",
  url: webEnv.suiJsonRpcUrl || getJsonRpcFullnodeUrl("mainnet"),
});
