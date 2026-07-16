import { describe, expect, it } from 'vitest';
import { browsableTopics } from '$theme/topic-counts';

describe('browsableTopics', () => {
  it('filters out topics with zero posts', () => {
    const result = browsableTopics([
      { value: 'news', label: 'News', count: 0 },
      { value: 'club', label: 'Club', count: 5 },
    ]);
    expect(result).toEqual([{ value: 'club', label: 'Club', count: 5 }]);
  });

  it('orders the surviving topics busiest first, not by vocabulary declaration order', () => {
    const result = browsableTopics([
      { value: 'education', label: 'Education', count: 6 },
      { value: 'club', label: 'Club', count: 22 },
      { value: 'racing', label: 'Racing', count: 11 },
      { value: 'results', label: 'Results', count: 8 },
    ]);
    expect(result.map((t) => t.value)).toEqual(['club', 'racing', 'results', 'education']);
  });
});
