import type {ApiResponse} from '@business-smoke/types';
import {HttpResponse, http} from 'msw';

export const handlers = [
  http.get('/api/examples', () =>
    HttpResponse.json<ApiResponse<Array<{id: string; label: string}>>>({
      data: [
        {id: '1', label: 'First mock item'},
        {id: '2', label: 'Second mock item'}
      ]
    })
  )
];
