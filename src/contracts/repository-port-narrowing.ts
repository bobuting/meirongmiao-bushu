import type { ISourceCredentialRepository, IReverseTraceRepository, IReverseAttemptRepository } from "./repository-ports/reverse-repository.js";
import type { IRepositoryClock } from "./repository-ports/common.js";

export type SourceCredentialRepository = IRepositoryClock & {
  sourceCredentials: ISourceCredentialRepository;
};

export type ReverseFetchOrchestratorRepository = IRepositoryClock & {
  reverseTraces: IReverseTraceRepository;
  reverseAttempts: IReverseAttemptRepository;
};
