import { Link } from 'react-router-dom';
import logoIcon from '../assets/Logo_Header-Trans.png';
import logoFallback from '../assets/Logo_Header.JPG';


export default function Header({ onSignInClick }) {
    return (
        <header>
            <div className="logo">
                <a href="/" className="header-brand">
                    <img src={logoIcon} alt="DocuCHQ" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = logoFallback; }} />
                    <span className="brand-wordmark"><span className="brand-docu">Docu</span><span className="brand-chq">CHQ</span></span>
                </a>
            </div>

            <nav>
                <ul>
                    <li><Link to="/how-it-works">How it works</Link></li>
                    <li className="btn1">
                        <a
                            href="#signin"
                            className="btn"
                            onClick={(e) => {
                                e.preventDefault();
                                onSignInClick();
                            }}
                        >
                            <span className="Signin">Sign-in</span>
                        </a>
                    </li>
                </ul>
            </nav>
        </header>
    );
}
