from django.urls import path
from .views import RegisterView, LoginView, ProfileView
from .views import register_page, login_page, profile_page, logout_view, home_redirect

urlpatterns = [
    # API endpoints (for token-based auth)
    path('api/register/', RegisterView.as_view(), name='api_register'),
    path('api/login/', LoginView.as_view(), name='api_login'),
    path('api/profile/', ProfileView.as_view(), name='api_profile'),
    
    # Template pages
    path('', home_redirect, name='home'),
    path('register/', register_page, name='register_page'),
    path('login/', login_page, name='login_page'),
    path('profile/', profile_page, name='profile_page'),
    path('logout/', logout_view, name='logout_page'),
]