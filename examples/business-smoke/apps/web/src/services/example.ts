import type {ApiResponse} from '@business-smoke/types';
import {http} from './http';

export interface ExampleItem {
  id: string;
  label: string;
}

export async function listExamples(): Promise<ExampleItem[]> {
  const {data} = await http.get<ApiResponse<ExampleItem[]>>('/examples');
  return data.data;
}
