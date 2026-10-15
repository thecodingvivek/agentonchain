export type RegistryAgent = {
  id: string;
  name: string;
  wallet: string;
  owner: string;
  description: string;
  endpointUrl: string;
  active: boolean;
};

export type RegistryPage = {
  agents: RegistryAgent[];
  total: string;
  contractAddress: string;
  chainId: number;
  blockNumber: number;
  nextOffset: string | null;
};
