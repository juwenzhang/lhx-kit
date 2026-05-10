import {http, HttpResponse, delay} from 'msw';

interface UserDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
}

const seed: Record<string, UserDetail> = {
  'u-001': {id: 'u-001', name: '张三', email: 'zhangsan@example.com', phone: '13800001111'},
  'u-002': {id: 'u-002', name: '李四', email: 'lisi@example.com', phone: '13900002222'}
};

export const handlers = [
  http.get('/api/examples', () => HttpResponse.json([
    {id: '1', label: 'First mock item'},
    {id: '2', label: 'Second mock item'}
  ])),

  http.get('/api/users/:id', async ({params}) => {
    await delay(400);
    const id = params.id as string;
    const user = seed[id];
    if (!user) return HttpResponse.json({error: `user ${id} not found`}, {status: 404});
    return HttpResponse.json(user);
  }),

  http.put('/api/users/:id', async ({params, request}) => {
    await delay(500);
    const id = params.id as string;
    const body = (await request.json()) as Partial<UserDetail>;
    seed[id] = {...seed[id], ...body, id};
    return HttpResponse.json(seed[id]);
  }),

  http.delete('/api/users/:id', async ({params}) => {
    await delay(400);
    const id = params.id as string;
    delete seed[id];
    return new HttpResponse(null, {status: 204});
  })
];
