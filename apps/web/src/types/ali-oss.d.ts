declare module "ali-oss" {
  interface OSSOptions {
    region: string;
    bucket: string;
    endpoint?: string;
    accessKeyId: string;
    accessKeySecret: string;
    stsToken?: string;
    secure?: boolean;
    timeout?: string | number;
  }

  interface PutOptions {
    headers?: Record<string, string>;
    progress?: (p: number) => number;
    mime?: string;
    meta?: Record<string, string>;
  }

  interface PutResult {
    name: string;
    url: string;
    res: {
      status: number;
      statusCode: number;
      headers: Record<string, string>;
    };
  }

  interface DeleteResult {
    res: {
      status: number;
      statusCode: number;
    };
  }

  interface SignatureUrlOptions {
    method?: "GET" | "PUT" | "POST" | "DELETE";
    expires?: number;
    response?: Record<string, string>;
    "Content-Type"?: string;
  }

  interface STSOptions {
    accessKeyId: string;
    accessKeySecret: string;
    endpoint?: string;
    timeout?: string | number;
  }

  interface AssumeRoleResult {
    Credentials: {
      AccessKeyId: string;
      AccessKeySecret: string;
      SecurityToken: string;
      Expiration: string;
    };
    AssumedRoleUser: {
      Arn: string;
      AssumedRoleId: string;
    };
  }

  class STS {
    constructor(options: STSOptions);
    assumeRole(
      roleArn: string,
      policy: Record<string, unknown> | string,
      durationSeconds: number,
      sessionName: string
    ): Promise<AssumeRoleResult>;
  }

  class OSS {
    constructor(options: OSSOptions);
    put(name: string, file: File | Blob | Buffer | ArrayBuffer, options?: PutOptions): Promise<PutResult>;
    delete(name: string): Promise<DeleteResult>;
    signatureUrl(name: string, options?: SignatureUrlOptions): string;
    get(name: string): Promise<{ content: Buffer; res: { status: number } }>;
  }

  export { OSS, STS };
  export default OSS;
}