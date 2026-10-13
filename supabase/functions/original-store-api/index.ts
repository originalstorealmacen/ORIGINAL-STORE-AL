import { createHandler } from './server.js';
Deno.serve(createHandler({env: name => Deno.env.get(name)}));
