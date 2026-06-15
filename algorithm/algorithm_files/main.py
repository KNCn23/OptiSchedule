import sys
from optisched.menu import MenuApp

def main():
    try:
        app = MenuApp()
        app.run()
    except KeyboardInterrupt:
        print("\nÇıkış yapılıyor...")
        sys.exit(0)
    except Exception as e:
        print(f"\nBir hata oluştu: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
