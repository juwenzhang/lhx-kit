import {http, HttpResponse} from 'msw';

export const handlers = [
  http.get('/api/examples', () => HttpResponse.json([
    {id: '1', label: 'First mock item'},
    {id: '2', label: 'Second mock item'}
  ]))
];
