import {Suspense, useEffect, useMemo, type ReactElement} from 'react';
import {Link, useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {ConfigProvider, Form, message} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {createConfiguredPage} from '@lhx-kit/renderer/react';
import {createRegistry} from '@lhx-kit/renderer';
import schema from '../render.json';
import {ActionButton} from '../components/ActionButton';
import {Banner} from '../components/Banner';
import {FormField} from '../components/FormField';
import {Section} from '../components/Section';
import {useUserDetailStore} from '@/stores/user-detail';

const registry = createRegistry();
registry.registerAll({
  Section: () => Section,
  Banner: () => Banner,
  FormField: () => FormField,
  ActionButton: () => ActionButton
});

/**
 * Action middleware gap: the renderer dispatches `(payload, ctx)` straight to
 * the registered handler with no interceptor chain. AOP concerns (tracking,
 * audit, error trap, perf) must be wrapped manually at registration time.
 */
function withTracking<TArgs extends unknown[], TRet>(
  name: string,
  fn: (...args: TArgs) => TRet
): (...args: TArgs) => TRet {
  return (...args) => {
    // eslint-disable-next-line no-console
    console.log(`[track] action=${name}`, args[0] ?? null);
    return fn(...args);
  };
}

export default function UserDetailPage(): ReactElement {
  const {id = 'u-001'} = useParams<{id: string}>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  /**
   * Route param gap: the schema cannot reach `params.id` — there is no
   * `route` root in `expression.ts:18` lookup. The host extracts it and
   * launders it through `state` / `flags`.
   */
  const role = search.get('role') === 'admin' ? 'admin' : 'user';

  const store = useUserDetailStore();

  /**
   * Network gap: the renderer has no lifecycle hooks. The host must run the
   * fetch in `useEffect` and update store; the schema only sees the result.
   */
  useEffect(() => {
    void store.fetchUser(id);
    // store.fetchUser is a stable zustand action ref; intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /**
   * State-snapshot gap: `createConfiguredPage` calls `useState({...options.state})`
   * once at mount (react.tsx:55). To push fresh state we must give the renderer
   * a *new component identity* — which is what `useMemo` recreating the factory
   * does. Every store mutation (including each keystroke) ⇒ new factory ⇒ full
   * remount ⇒ registry resolution rerun. The slow feel is the gap, made visible.
   */
  const Page = useMemo(
    () =>
      createConfiguredPage({
        schema: schema as never,
        registry: registry as never,
        state: {
          title: store.user.id
            ? `用户：${store.user.name ?? '未命名'} (${store.user.id})`
            : '用户详情',
          user: store.user,
          loading: store.loading,
          saving: store.saving,
          error: store.error
        },
        flags: {role, userId: id},
        actions: {
          saveUser: withTracking('saveUser', async () => {
            const r = await store.saveUser();
            if (r.ok) message.success(r.message);
            else message.error(r.message);
          }),
          deleteUser: withTracking('deleteUser', async () => {
            const r = await store.deleteUser();
            if (r.ok) {
              message.success(r.message);
              navigate('/');
            } else {
              message.error(r.message);
            }
          })
        }
      }),
    // store.version is the canonical mutation fingerprint — see store comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.version, role, id]
  );

  return (
    <ConfigProvider locale={zhCN}>
      <Form layout="vertical" style={{maxWidth: 520, margin: '24px auto', padding: '0 16px'}}>
        <div style={{marginBottom: 16}}>
          <Link to="/">← 回首页</Link>
          <span style={{marginLeft: 12, color: '#888'}}>
            提示: 在 URL 上加 <code>?role=admin</code> 显示删除按钮; 试 <code>#/user/u-002</code> 切用户; <code>#/user/missing</code> 触发错误态。
          </span>
        </div>
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      </Form>
    </ConfigProvider>
  );
}
