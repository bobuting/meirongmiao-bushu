// test/fixtures/index.ts
/**
 * 测试 fixtures 统一导出
 */

// 数据生成器
export {
  generateId,
  createMockUser,
  createMockProject,
  createMockWorkflowState,
  createMockTrendEntry,
  createMockTrendSyncJob,
  createMockLibraryScript,
  createMockSession,
} from './test-data.js';

// Repository Mock
export {
  createMockUserRepository,
  createMockSessionRepository,
  createMockProjectRepository,
  createMockWorkflowStateRepository,
  createMockTrendEntryRepository,
  createMockTrendSyncJobRepository,
  createMockRepositories,
} from './mock-repositories.js';

// LLM Mock
export {
  createMockLLMAdapter,
  createRecordLLMAdapter,
  createReplayLLMAdapter,
  type MockLLMConfig,
  type LLMResponse,
} from './mock-llm.js';

// 数据库测试工具
export {
  createTestDatabasePool,
  clearTables,
  clearAllTestTables,
  withTransactionRollback,
  createTestDbHooks,
  insertTestUser,
  insertTestProject,
} from './db-test-helper.js';