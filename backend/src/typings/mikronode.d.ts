declare module "mikronode" {
  // Basic types based on mikronode usage (expand if needed)
  class MikroNode {
    constructor(ip: string, username: string, password: string);
    connect(): Promise<any>;
    channel(name: string): any;
  }

  export default MikroNode;
}
