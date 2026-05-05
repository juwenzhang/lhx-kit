import {http} from './http';

export interface ExampleItem {
  id: string;
  label: string;
}

export async function listExamples(): Promise<ExampleItem[]> {
  const {data} = await http.get<ExampleItem[]>('/examples');
  return data;
}
