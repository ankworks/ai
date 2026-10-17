import { Link } from 'react-router-dom';
import { Logo, useI18n } from '@conai/ui';
import { publicEnv } from '../env';

export function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="border-border bg-surface border-t">
      <div className="container mx-auto grid gap-10 px-4 py-12 md:grid-cols-4 md:px-6">
        <div className="space-y-3">
          <Logo withWordmark size={28} />
          <p className="text-muted-foreground max-w-xs text-sm">{t('hero.subtitle')}</p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold">{t('footer.product')}</h3>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li>
              <a href="/#features" className="hover:text-foreground">
                {t('nav.features')}
              </a>
            </li>
            <li>
              <a href="/#plans" className="hover:text-foreground">
                {t('nav.plans')}
              </a>
            </li>
            <li>
              <a href={publicEnv.VITE_WORKSPACE_URL} className="hover:text-foreground">
                {t('nav.workspace')}
              </a>
            </li>
            <li>
              <a href={publicEnv.VITE_STATUS_URL} className="hover:text-foreground">
                {t('nav.status')}
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold">{t('footer.legal')}</h3>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li>
              <Link to="/trust#privacy" className="hover:text-foreground">
                {t('footer.privacy')}
              </Link>
            </li>
            <li>
              <Link to="/trust#guidelines" className="hover:text-foreground">
                {t('footer.guidelines')}
              </Link>
            </li>
            <li>
              <Link to="/trust#safety" className="hover:text-foreground">
                {t('footer.safety')}
              </Link>
            </li>
            <li>
              <Link to="/trust#report" className="hover:text-foreground">
                Report abuse
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold">{t('footer.company')}</h3>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li>
              <Link to="/trust" className="hover:text-foreground">
                {t('nav.trust')}
              </Link>
            </li>
            <li>
              <a href={publicEnv.VITE_ACCOUNT_URL} className="hover:text-foreground">
                {t('nav.account')}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-border border-t py-5">
        <div className="text-muted-foreground container mx-auto flex flex-col items-center justify-between gap-2 px-4 text-xs md:flex-row md:px-6">
          <span>
            © {year} ConAI · {t('footer.rights')}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="bg-success inline-block h-2 w-2 rounded-full" aria-hidden />
            <a href={publicEnv.VITE_STATUS_URL} className="hover:text-foreground">
              {t('nav.status')}
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
